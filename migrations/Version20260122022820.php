<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260122022820 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE portfolio_history (id INT AUTO_INCREMENT NOT NULL, start_date DATETIME NOT NULL, end_date DATETIME DEFAULT NULL, technician_id INT NOT NULL, customer_id INT NOT NULL, INDEX IDX_710F5F85E6C5D496 (technician_id), INDEX IDX_710F5F859395C3F3 (customer_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE portfolio_history ADD CONSTRAINT FK_710F5F85E6C5D496 FOREIGN KEY (technician_id) REFERENCES `user` (id)');
        $this->addSql('ALTER TABLE portfolio_history ADD CONSTRAINT FK_710F5F859395C3F3 FOREIGN KEY (customer_id) REFERENCES customer (id)');
        $this->addSql('ALTER TABLE customer ADD created_by_id INT DEFAULT NULL, ADD affected_to_id INT DEFAULT NULL');
        $this->addSql('ALTER TABLE customer ADD CONSTRAINT FK_81398E09B03A8386 FOREIGN KEY (created_by_id) REFERENCES `user` (id)');
        $this->addSql('ALTER TABLE customer ADD CONSTRAINT FK_81398E09F3310D50 FOREIGN KEY (affected_to_id) REFERENCES `user` (id)');
        $this->addSql('CREATE INDEX IDX_81398E09B03A8386 ON customer (created_by_id)');
        $this->addSql('CREATE INDEX IDX_81398E09F3310D50 ON customer (affected_to_id)');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE portfolio_history DROP FOREIGN KEY FK_710F5F85E6C5D496');
        $this->addSql('ALTER TABLE portfolio_history DROP FOREIGN KEY FK_710F5F859395C3F3');
        $this->addSql('DROP TABLE portfolio_history');
        $this->addSql('ALTER TABLE customer DROP FOREIGN KEY FK_81398E09B03A8386');
        $this->addSql('ALTER TABLE customer DROP FOREIGN KEY FK_81398E09F3310D50');
        $this->addSql('DROP INDEX IDX_81398E09B03A8386 ON customer');
        $this->addSql('DROP INDEX IDX_81398E09F3310D50 ON customer');
        $this->addSql('ALTER TABLE customer DROP created_by_id, DROP affected_to_id');
    }
}
