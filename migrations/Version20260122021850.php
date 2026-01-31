<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260122021850 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE customer ADD created_by_id INT DEFAULT NULL, ADD affected_to_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE customer ADD CONSTRAINT FK_81398E09B03A8386 FOREIGN KEY (created_by_id) REFERENCES `user` (id)');
        $this->addSql('ALTER TABLE customer ADD CONSTRAINT FK_81398E09F3310D50 FOREIGN KEY (affected_to_id) REFERENCES `user` (id)');
        $this->addSql('CREATE INDEX IDX_81398E09B03A8386 ON customer (created_by_id)');
        $this->addSql('CREATE INDEX IDX_81398E09F3310D50 ON customer (affected_to_id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE customer DROP FOREIGN KEY FK_81398E09B03A8386');
        $this->addSql('ALTER TABLE customer DROP FOREIGN KEY FK_81398E09F3310D50');
        $this->addSql('DROP INDEX IDX_81398E09B03A8386 ON customer');
        $this->addSql('DROP INDEX IDX_81398E09F3310D50 ON customer');
        $this->addSql('ALTER TABLE customer DROP created_by_id, DROP affected_to_id');
    }
}
